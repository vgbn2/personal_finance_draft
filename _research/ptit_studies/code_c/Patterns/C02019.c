/*
 * Filename: C02019.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int cs = 1, le = 1;
    for (int i = 1; i <= n; i++)
    {
        int a = 2;
        for (int j = 1; j <= le; j++)
        {
            if (j < cs)
            {
                printf("%d", a); // Print result
                a += 2;
            }
            if (j == cs)
            {
                printf("%d", a); // Print result
                a -= 2;
            }
            if (j > cs)
            {
                printf("%d", a); // Print result
                a -= 2;
            }
        }
        printf("\n"); // Print result
        le += 2;
        cs += 1;
    }
    return 0;
}