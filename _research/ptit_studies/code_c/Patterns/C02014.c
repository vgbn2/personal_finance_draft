/*
 * Filename: C02014.c
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
    int l = 1, r = 2 * n - 1;
    for (int i = 1; i <= n; i++)
    {
        int a = n;
        for (int j = 1; j <= 2 * n - 1; j++)
        {
            if (j < l)
            {
                printf("%d", a); // Print result
                a--;
            }
            else if (j >= r)
            {
                printf("%d", a); // Print result
                a++;
            }
            else
                printf("%d", a); // Print result
        }
        l++;
        r--;
        printf("\n"); // Print result
    }
    l -= 2;
    r += 2;
    for (int i = 2; i <= n; i++)
    {
        int a = n;
        for (int j = 1; j <= 2 * n - 1; j++)
        {
            if (j < l)
            {
                printf("%d", a); // Print result
                a--;
            }
            else if (j >= r)
            {
                printf("%d", a); // Print result
                a++;
            }
            else
                printf("%d", a); // Print result
        }
        l--;
        r++;
        printf("\n"); // Print result
    }
}