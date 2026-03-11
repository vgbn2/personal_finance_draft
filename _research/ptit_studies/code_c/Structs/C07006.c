/*
 * Filename: C07006.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

struct Point
{
    double x;
    double y;
} A, B, C;

// Function to solve specific test case
void solve()
{
    scanf("%lf %lf %lf %lf %lf %lf", &A.x, &A.y, &B.x, &B.y, &C.x, &C.y); // Read input
    double d1 = sqrt((A.x - B.x) * (A.x - B.x) + (A.y - B.y) * (A.y - B.y));
    double d2 = sqrt((B.x - C.x) * (B.x - C.x) + (B.y - C.y) * (B.y - C.y));
    double d3 = sqrt((A.x - C.x) * (A.x - C.x) + (A.y - C.y) * (A.y - C.y));
    if (d1 + d2 <= d3 || d1 + d3 <= d2 || d2 + d3 <= d1)
        printf("INVALID\n"); // Print result
    else
    {
        double p = (d1 + d2 + d3) / 2;
        printf("%.2lf\n", sqrt(p * (p - d1) * (p - d2) * (p - d3))); // Print result
    }
}
// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}