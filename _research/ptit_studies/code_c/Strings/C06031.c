/*
 * Filename: C06031.c
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
    char s[55];
    scanf("%s", s); // Read input
    int l[55];
    l[0] = 1;
    for (int i = 0; i < strlen(s); i++)
    {
        int max = 0;
        for (int j = 0; j < i; j++)
            if (s[j] < s[i] && max < l[j])
                max = l[j];
        l[i] = max + 1;
    }
    int MAX = 0;
    for (int i = 0; i < strlen(s); i++)
        if (MAX < l[i])
            MAX = l[i];
    printf("%d", 26 - MAX); // Print result
    return 0;
}