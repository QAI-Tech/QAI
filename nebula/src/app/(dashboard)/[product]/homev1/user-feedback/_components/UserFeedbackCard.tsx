import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserFeedbackSchema } from "@/lib/types";

type Props = {
  data: UserFeedbackSchema;
};

const UserFeedbackCard = ({ data }: Props) => {
  return (
    <div className="container mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>User Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">TestCase ID</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((feedback) => (
                <TableRow key={feedback.id}>
                  <TableCell className="font-medium">
                    <Badge
                      variant="outline"
                      className="w-[80px] justify-center"
                    >
                      {feedback.id}
                    </Badge>
                  </TableCell>
                  <TableCell>{feedback.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserFeedbackCard;
