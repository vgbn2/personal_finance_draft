/*
 * Filename: C03037.c
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
#include <string.h>

// Entry point
int main()
{
    char s[20];
    scanf("%s", &s); // Read input
    int dd[10] = {0};
    for (int i = 0; i < strlen(s); i++)
    {
        int x = s[i] - '0';
        if (x == 2 || x == 3 || x == 5 || x == 7)
            dd[x]++;
    }

    for (int i = 0; i < strlen(s); i++)
    {
        int x = s[i] - '0';
        if (dd[x] > 0)
        {
            printf("%d %d\n", x, dd[x]); // Print result
            dd[x] = 0;
        }
    }
    return 0;
}